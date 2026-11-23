#!/usr/bin/env node
/**
 * يتحقق من هجرة نظام الصلاحيات (20261123120000_staff_permissions.sql) على Postgres 17
 * مؤقت محلي: يطبّقها على نسخة مصغّرة (replica-staff-permissions.sql)، ثم يفحص
 * الافتراضيات والتخصيص والقفل والسياسات والدوال المركزية، ثم التراجع وإعادة التطبيق.
 *
 *   export NODE_PATH="$TEMP/ys-db-local/node_modules"
 *   node scripts/db-local/verify-staff-permissions.cjs
 */
const path = require('node:path')
const { startServer, connect, finish, read, repoPath } = require('./lib.cjs')

const MIGRATION = repoPath('supabase/migrations/20261123120000_staff_permissions.sql')
const ROLLBACK = repoPath('docs/staff-permissions/rollback-20261123120000.sql')

const U = {
  admin: '00000000-0000-4000-8000-000000000001',
  gm: '00000000-0000-4000-8000-000000000002',
  wm: '00000000-0000-4000-8000-000000000003',
  fsm: '00000000-0000-4000-8000-000000000004',
  acc: '00000000-0000-4000-8000-000000000005',
  tailor: '00000000-0000-4000-8000-000000000006',
  gmInactive: '00000000-0000-4000-8000-000000000007',
  client: '00000000-0000-4000-8000-000000000008',
  tailor2: '00000000-0000-4000-8000-000000000009',
}
const WM_WORKER_ID = '10000000-0000-4000-8000-000000000003'

let failures = 0
let passes = 0
function check(name, ok, detail = '') {
  if (ok) { passes++; console.log(`  ✓ ${name}`) }
  else { failures++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}

async function as(client, userId, fn, role = 'authenticated') {
  await client.query('begin')
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role })])
    await client.query(`set local role ${role}`)
    const result = await fn()
    await client.query('rollback')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
}

async function scalar(client, userId, sql, params = []) {
  return as(client, userId, async () => (await client.query(sql, params)).rows[0]?.v)
}

async function errorOf(client, userId, sql, params = []) {
  try { await as(client, userId, () => client.query(sql, params)); return null } catch (e) { return e.message }
}

/** يشغّل كتابة كمستخدم ويُبقيها (commit) — للتخصيص عبر الدالة. */
async function commitAs(client, userId, sql, params = []) {
  await client.query('begin')
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })])
    await client.query('set local role authenticated')
    const r = await client.query(sql, params)
    await client.query('commit')
    return r
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  }
}

const can = (client, userId, key) => scalar(client, userId, 'select public.staff_can($1) as v', [key])

async function seed(client) {
  await client.query(`
    insert into public.users (id, email, role, is_active) values
      ('${U.admin}', 'a@x', 'admin', true),
      ('${U.gm}', 'g@x', 'worker', true),
      ('${U.wm}', 'w@x', 'worker', true),
      ('${U.fsm}', 'f@x', 'worker', true),
      ('${U.acc}', 'c@x', 'worker', true),
      ('${U.tailor}', 't@x', 'worker', true),
      ('${U.gmInactive}', 'gi@x', 'worker', false),
      ('${U.client}', 'cl@x', 'client', true),
      ('${U.tailor2}', 't2@x', 'worker', true);
    insert into public.workers (id, user_id, worker_type) values
      (gen_random_uuid(), '${U.gm}', 'general_manager'),
      ('${WM_WORKER_ID}', '${U.wm}', 'workshop_manager'),
      (gen_random_uuid(), '${U.fsm}', 'fabric_store_manager'),
      (gen_random_uuid(), '${U.acc}', 'accountant'),
      (gen_random_uuid(), '${U.tailor}', 'tailor'),
      (gen_random_uuid(), '${U.gmInactive}', 'general_manager'),
      (gen_random_uuid(), '${U.tailor2}', 'tailor');
    insert into public.orders (id, client_name) values ('20000000-0000-4000-8000-000000000001', 'test');
  `)
}

async function runChecks(client) {
  console.log('\nالكتالوج')
  const count = (await client.query('select count(*)::int as n from public.staff_permission_catalog')).rows[0].n
  check('49 صلاحية في الكتالوج', count === 49, `n=${count}`)

  console.log('\nالافتراضيات')
  check('المدير الأكبر: كل شيء', await can(client, U.admin, 'orders.delete') === true)
  check('المدير الأكبر: حتى المقفل', await can(client, U.admin, 'workers.manage') === true)
  check('المدير العام: إضافة طلب', await can(client, U.gm, 'orders.create') === true)
  check('المدير العام: المحاسبة', await can(client, U.gm, 'accounting.tailoring.cash_box') === true)
  check('المدير العام: المقفل ممنوع', await can(client, U.gm, 'workers.manage') === false)
  check('المدير العام: رواتب التفصيل ممنوعة', await can(client, U.gm, 'accounting.tailoring.salaries') === false)
  check('المدير العام: مفتاح غير معروف = لا', await can(client, U.gm, 'nope.key') === false)
  check('مدير الورشة: كل الطلبات', await can(client, U.wm, 'orders.view_all') === true)
  check('مدير الورشة: لا إضافة طلب', await can(client, U.wm, 'orders.create') === false)
  check('مدير الورشة: لا جوال العميلة', await can(client, U.wm, 'orders.client_phone') === false)
  check('مدير الأقمشة: إدارة الأقمشة', await can(client, U.fsm, 'fabrics.manage') === true)
  check('مدير الأقمشة: لا طلبات تفصيل', await can(client, U.fsm, 'orders.view_all') === false)
  check('المحاسب: مصروفات المواد', await can(client, U.acc, 'accounting.tailoring.materials') === true)
  check('المحاسب: لا مبيعات الأقمشة', await can(client, U.acc, 'accounting.fabrics.income') === false)
  check('الخياط: لا شيء', await can(client, U.tailor, 'orders.view_all') === false)
  check('المدير العام الموقوف: لا شيء', await can(client, U.gmInactive, 'orders.create') === false)
  check('العميل: لا شيء', await can(client, U.client, 'orders.create') === false)
  check('بلا جلسة: لا شيء', await scalar(client, null, `select public.staff_can('orders.create') as v`, [], ) === false)

  console.log('\nصلاحياتي')
  const mine = await scalar(client, U.wm, 'select public.get_my_staff_permissions() as v')
  check('get_my_staff_permissions: النوع', mine?.worker_type === 'workshop_manager')
  check('get_my_staff_permissions: 49 مفتاحاً', mine && Object.keys(mine.permissions).length === 49)
  check('get_my_staff_permissions: القيم', mine?.permissions['orders.schedule'] === true && mine?.permissions['orders.create'] === false)

  console.log('\nالحفظ (المدير الأكبر فقط)')
  check('عامل لا يستطيع الحفظ',
    /active_admin_required/.test(await errorOf(client, U.gm, `select public.set_staff_permissions($1, '{"orders.create":true}'::jsonb)`, [U.tailor]) || ''))
  check('عامل لا يقرأ صلاحيات غيره',
    /active_admin_required/.test(await errorOf(client, U.gm, `select public.get_staff_permissions($1)`, [U.tailor]) || ''))
  check('لا تخصيص للمدير الأكبر',
    /ONLY_WORKERS_HAVE_PERMISSIONS/.test(await errorOf(client, U.admin, `select public.set_staff_permissions($1, '{}'::jsonb)`, [U.admin]) || ''))
  check('مفتاح غير معروف مرفوض',
    /UNKNOWN_PERMISSION/.test(await errorOf(client, U.admin, `select public.set_staff_permissions($1, '{"x.y":true}'::jsonb)`, [U.tailor]) || ''))
  check('قيمة غير منطقية مرفوضة',
    /INVALID_PERMISSION_VALUE/.test(await errorOf(client, U.admin, `select public.set_staff_permissions($1, '{"orders.create":"yes"}'::jsonb)`, [U.tailor]) || ''))
  check('الكتابة المباشرة في الجدول ممنوعة',
    /permission denied/.test(await errorOf(client, U.admin, `insert into public.staff_permissions (user_id, overrides) values ($1, '{}')`, [U.tailor]) || ''))

  await commitAs(client, U.admin,
    `select public.set_staff_permissions($1, '{"orders.create":true,"orders.manage_workflow":true,"accounting.tailoring.income":true,"accounting.tailoring.cash_box":true,"workers.manage":true}'::jsonb)`,
    [U.tailor])
  await commitAs(client, U.admin, `select public.set_staff_permissions($1, '{"orders.delete":false}'::jsonb)`, [U.gm])
  await commitAs(client, U.admin, `select public.set_staff_permissions($1, '{"orders.view_all":false}'::jsonb)`, [U.wm])

  const stored = (await client.query('select overrides from public.staff_permissions where user_id = $1', [U.tailor])).rows[0]?.overrides
  check('المقفل لا يُخزَّن', stored && !('workers.manage' in stored) && stored['orders.create'] === true)
  check('الخياط بعد المنح: إضافة طلب', await can(client, U.tailor, 'orders.create') === true)
  check('الخياط بعد المنح: المقفل ما زال ممنوعاً', await can(client, U.tailor, 'workers.manage') === false)
  check('المدير العام بعد الإطفاء: لا حذف', await can(client, U.gm, 'orders.delete') === false)
  check('المدير العام بعد الإطفاء: الباقي كما هو', await can(client, U.gm, 'orders.edit') === true)
  check('مدير الورشة بعد الإطفاء: لا كل الطلبات', await can(client, U.wm, 'orders.view_all') === false)
  check('الخياط الآخر لم يتأثر', await can(client, U.tailor2, 'orders.create') === false)

  const detail = await scalar(client, U.admin, 'select public.get_staff_permissions($1) as v', [U.tailor])
  check('get_staff_permissions: التخصيص والفعلي', detail?.overrides['orders.create'] === true && detail?.permissions['orders.create'] === true)

  console.log('\nقراءة جدول التخصيص')
  const ownRows = await as(client, U.tailor, async () => (await client.query('select user_id from public.staff_permissions')).rows)
  check('العامل يرى صفه فقط', ownRows.length === 1 && ownRows[0].user_id === U.tailor, JSON.stringify(ownRows))
  const adminRows = await as(client, U.admin, async () => (await client.query('select count(*)::int as n from public.staff_permissions')).rows[0].n)
  check('المدير الأكبر يرى الكل', adminRows === 3, `n=${adminRows}`)

  console.log('\nمسارات الخادم')
  check('staff_can_user ممنوعة على authenticated',
    /permission denied/.test(await errorOf(client, U.admin, `select public.staff_can_user($1, array['orders.create'])`, [U.tailor]) || ''))
  const viaService = await as(client, null, async () =>
    (await client.query(`select public.staff_can_user($1, array['orders.create']) as v`, [U.tailor])).rows[0].v, 'service_role')
  check('staff_can_user لمفتاح الخدمة', viaService === true)

  console.log('\nسياسات الطلبات')
  const insertOk = await errorOf(client, U.tailor, `insert into public.orders (client_name) values ('x')`)
  check('الخياط الممنوح يضيف طلباً', insertOk === null, insertOk || '')
  const insertDenied = await errorOf(client, U.tailor2, `insert into public.orders (client_name) values ('x')`)
  check('الخياط غير الممنوح لا يضيف', /row-level security/.test(insertDenied || ''), insertDenied || 'no error')
  const gmDeleted = await as(client, U.gm, async () => (await client.query(`delete from public.orders returning id`)).rowCount)
  check('المدير العام بلا صلاحية الحذف لا يحذف', gmDeleted === 0, `deleted=${gmDeleted}`)
  const gmSees = await as(client, U.gm, async () => (await client.query(`select count(*)::int as n from public.orders`)).rows[0].n)
  check('المدير العام يرى الطلبات', gmSees === 1)
  const wmStillSees = await as(client, U.wm, async () => (await client.query(`select count(*)::int as n from public.orders`)).rows[0].n)
  check('مدير الورشة ما زال يرى الطلبات (الشرط القديم باقٍ — الإطفاء في الواجهة)', wmStillSees === 1)

  console.log('\nإسناد القصّاص')
  const cutterDenied = await errorOf(client, U.tailor2,
    `update public.orders set cutter_id = $1 where id = '20000000-0000-4000-8000-000000000001'`, [WM_WORKER_ID])
  check('خياط غير ممنوح: لا يرى الطلب ليعدّله', cutterDenied === null) // RLS يُخفي الصف فلا يتحدّث شيء
  const cutterRows = await as(client, U.tailor, async () =>
    (await client.query(`update public.orders set cutter_id = $1 where id = '20000000-0000-4000-8000-000000000001' returning cutter_name`, [WM_WORKER_ID])).rows)
  check('الممنوح «إدارة سير الطلب» يُسند القصّاص', cutterRows.length === 1 && cutterRows[0].cutter_name === null, JSON.stringify(cutterRows))

  console.log('\nالدوال المركزية')
  const fin = (u, b) => scalar(client, u, 'select private.can_access_finance_branch($1) as v', [b])
  check('مدير الأقمشة: فرع الأقمشة (قديم)', await fin(U.fsm, 'fabrics') === true)
  check('المدير العام: فرع الأقمشة (جديد)', await fin(U.gm, 'fabrics') === true)
  check('المحاسب: التفصيل (قديم)', await fin(U.acc, 'tailoring') === true)
  check('الخياط الممنوح الواردات: التفصيل', await fin(U.tailor, 'tailoring') === true)
  check('الخياط الممنوح: ليس الأقمشة', await fin(U.tailor, 'fabrics') === false)
  check('الخياط الآخر: لا شيء', await fin(U.tailor2, 'tailoring') === false)
  const box = (u, w) => scalar(client, u, 'select private.cash_box_user_is_authorized($1) as v', [w])
  check('الصندوق: الخياط الممنوح', await box(U.tailor, false) === true)
  check('الصندوق: الخياط الآخر', await box(U.tailor2, false) === false)
  check('السحب: المحاسب (قديم)', await box(U.acc, true) === true)
  const payroll = async (u, b) => errorOf(client, u, 'select private.assert_payroll_branch_access($1)', [b])
  check('رواتب الأقمشة: المدير العام', await payroll(U.gm, 'fabrics') === null)
  check('رواتب التفصيل: المدير العام ممنوع', /PAYROLL_FORBIDDEN/.test(await payroll(U.gm, 'tailoring') || ''))
  check('إدارة الأقمشة: المدير العام', await scalar(client, U.gm, 'select public.can_manage_fabrics() as v') === true)
  check('إدارة الأقمشة: الخياط', await scalar(client, U.tailor2, 'select public.can_manage_fabrics() as v') === false)
}

async function main() {
  const server = await startServer('staff-permissions')
  const client = await connect()
  try {
    await client.query(read(path.join(__dirname, 'replica-staff-permissions.sql')))
    await seed(client)

    console.log('تطبيق الهجرة…')
    await client.query(read(MIGRATION))
    await runChecks(client)

    console.log('\nإعادة التطبيق (idempotent)…')
    await client.query(read(MIGRATION))
    check('إعادة التطبيق تنجح وتحافظ على التخصيص',
      (await client.query('select count(*)::int as n from public.staff_permissions')).rows[0].n === 3)

    console.log('\nالتراجع…')
    await client.query(read(ROLLBACK))
    const gone = (await client.query(`select to_regclass('public.staff_permissions') as t, to_regprocedure('public.staff_can(text)') as f`)).rows[0]
    check('التراجع يحذف الجدول والدوال', gone.t === null && gone.f === null)
    check('التراجع يعيد فرع الأقمشة للنص القديم (المدير العام لا)',
      await scalar(client, U.gm, `select private.can_access_finance_branch('fabrics') as v`) === false)
    check('التراجع يعيد الصندوق (المدير العام نعم كما كان)',
      await scalar(client, U.gm, `select private.cash_box_user_is_authorized(false) as v`) === true)

    console.log('\nإعادة التطبيق بعد التراجع…')
    await client.query(read(MIGRATION))
    check('تعود الصلاحيات الافتراضية', await can(client, U.gm, 'orders.create') === true)
  } catch (error) {
    failures++
    console.error('\n💥', error.message)
  } finally {
    await client.end().catch(() => {})
  }
  console.log(`\n${passes} نجح، ${failures} فشل`)
  await finish(server, failures ? 1 : 0)
}

main()
