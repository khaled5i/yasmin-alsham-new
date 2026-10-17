// Isolated PostgreSQL only; does not load credentials or connect to production.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { startServer, connect } = require('./lib.cjs')
const migration = fs.readFileSync(path.join(__dirname,
  '../../supabase/migrations/20261007100052_staff_ai_request_limits.sql'), 'utf8')
const admin = 'aaaaaaaa-0000-4000-8000-000000000001'
const worker = 'aaaaaaaa-0000-4000-8000-000000000002'
const inactive = 'aaaaaaaa-0000-4000-8000-000000000003'
const customer = 'aaaaaaaa-0000-4000-8000-000000000004'
const unknown = 'aaaaaaaa-0000-4000-8000-000000000005'
const call = async (c, id, op) => (await c.query(
  'select public.staff_ai_take_request_budget($1::uuid,$2::text) as result', [id, op])).rows[0].result
async function main() {
  const server = await startServer('staff-ai-budget'); let db
  try {
    db = await connect()
    await db.query(`create role anon; create role authenticated; create role service_role;
      create schema private;
      create table public.users(id uuid primary key, role text, is_active boolean);
      insert into public.users values ('${admin}','admin',true),('${worker}','worker',true),
      ('${inactive}','admin',false),('${customer}','customer',true);`)
    assert(!/public\.(income|expenses|fabric_store_|fabric_inventory)/.test(migration))
    await db.query(migration)
    const permissions = (await db.query(`select
      has_function_privilege('anon','public.staff_ai_take_request_budget(uuid,text)','execute') as anon,
      has_function_privilege('authenticated','public.staff_ai_take_request_budget(uuid,text)','execute') as authenticated,
      has_function_privilege('service_role','public.staff_ai_take_request_budget(uuid,text)','execute') as service,
      has_table_privilege('service_role','private.staff_ai_request_limits','select') as direct,
      (select relrowsecurity from pg_class where oid='private.staff_ai_request_limits'::regclass) as rls;`)).rows[0]
    assert.deepEqual(permissions, { anon: false, authenticated: false, service: true, direct: false, rls: true })
    await db.query('set role anon')
    await assert.rejects(call(db, admin, 'translate-text'), e => e.code === '42501')
    await db.query('reset role; set role service_role')
    for (const id of [inactive, customer, unknown]) assert.equal((await call(db, id, 'translate-text')).status, 'forbidden')
    assert.equal((await call(db, admin, 'not-a-paid-operation')).status, 'bad_request')
    assert.equal((await call(db, worker, 'translate-text')).status, 'allowed')
    await db.query('reset role')
    assert.equal(Number((await db.query('select count(*) from private.staff_ai_request_limits')).rows[0].count), 2)
    console.log('PASS service-only function, closed RLS table, rejected inactive/unknown/customer, no counter for refusals')

    // Multiple database sessions represent independent Vercel instances.
    const peers = await Promise.all(Array.from({ length: 10 }, () => connect()))
    try {
      await Promise.all(peers.map(c => c.query('set role service_role')))
      const responses = (await Promise.all(peers.map(async c => {
        const out = []; for (let i = 0; i < 5; i++) out.push(await call(c, admin, 'generate-design-image'))
        return out
      }))).flat()
      assert.equal(responses.filter(r => r.status === 'allowed').length, 30)
      assert.equal(responses.filter(r => r.status === 'rate_limited').length, 20)
      assert(responses.filter(r => r.status === 'rate_limited').every(r => r.retry_after_seconds > 0 && r.retry_after_seconds <= 600))
      assert.equal((await call(peers[0], admin, 'remove-model')).status, 'rate_limited', 'image budget shared across image operations')
      assert.equal((await call(peers[0], worker, 'remove-model')).status, 'allowed', 'separate employee budget')
      assert.equal((await call(peers[0], admin, 'translate-text')).status, 'allowed', 'separate text budget')
    } finally { await Promise.all(peers.map(c => c.end())) }
    const hits = (await db.query(`select hits from private.staff_ai_request_limits
      where subject_id=$1 and operation_group='image' and window_seconds=600
      order by window_start desc limit 1`, [admin])).rows[0].hits
    assert.equal(hits, 30, 'refused calls do not increase accepted counts')
    console.log('PASS 50 concurrent attempts on 10 sessions: exactly 30 allowed; groups/users independent')

    // Reset only the test fixture short window and saturate the daily one.
    await db.query(`update private.staff_ai_request_limits set hits=case when window_seconds=86400 then 200 else 0 end
      where subject_id=$1 and operation_group='image'`, [admin])
    await db.query('set role service_role')
    const daily = await call(db, admin, 'convert-to-cartoon')
    assert.equal(daily.status, 'rate_limited'); assert(daily.retry_after_seconds > 0 && daily.retry_after_seconds <= 86400)
    await db.query('reset role')
    await db.query(`update public.users set is_active=false where id=$1`, [worker])
    await db.query('set role service_role')
    assert.equal((await call(db, worker, 'translate-text')).status, 'forbidden', 'profile is rechecked by RPC')
    await db.query('reset role')
    const rollback = fs.readFileSync(path.join(__dirname,
      '../../docs/store-launch-plans/implementation/staff-ai-rate-limits-rollback.sql'), 'utf8')
    await db.query(rollback)
    await db.query('set role service_role')
    await assert.rejects(call(db, admin, 'spatial-ocr'), e => e.code === '42501')
    console.log('PASS daily cap, stopped worker recheck, safe rollback denies RPC without erasing counters')
  } finally { if (db) await db.end(); await server.stop() }
}
main().catch(error => { console.error(error.stack); process.exit(1) })
