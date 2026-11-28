#!/usr/bin/env node
/**
 * يتحقق من هجرة 20261124120000_gm_payroll_print_station_grants.sql على Postgres 17 مؤقت:
 *   - النسخة المصغّرة + هجرة الصلاحيات 20261123120000
 *   - نسخ بديلة من الدوال الحية الـ18 تحمل سطر الفحص نفسه حرفياً (كما تأكّد من
 *     الإنتاج: كل نص يظهر مرة واحدة بالضبط)، وبعده يرجع الجسم «ok»
 *   - الهجرة، ثم الفحوص، ثم التراجع (النص يعود حرفياً) وإعادة التطبيق.
 *
 *   export NODE_PATH="$TEMP/ys-db-local/node_modules"
 *   node scripts/db-local/verify-gm-payroll-print-grants.cjs
 */
const path = require('node:path')
const { startServer, connect, finish, read, repoPath } = require('./lib.cjs')

const BASE_MIGRATION = repoPath('supabase/migrations/20261123120000_staff_permissions.sql')
const MIGRATION = repoPath('supabase/migrations/20261124120000_gm_payroll_print_station_grants.sql')
const ROLLBACK = repoPath('docs/staff-permissions/rollback-20261124120000.sql')

const U = {
  admin: '00000000-0000-4000-8000-000000000001',
  gm: '00000000-0000-4000-8000-000000000002',
  gm2: '00000000-0000-4000-8000-000000000003',
  wm: '00000000-0000-4000-8000-000000000004',
  tailor: '00000000-0000-4000-8000-000000000005',
  gmInactive: '00000000-0000-4000-8000-000000000006',
  fsm: '00000000-0000-4000-8000-000000000007',
}
const OP_TAILORING = '30000000-0000-4000-8000-000000000001'
const OP_FABRICS = '30000000-0000-4000-8000-000000000002'
const KEYS = ['accounting.tailoring.salaries', 'settings.print_stations']

let failures = 0
let passes = 0
function check(name, ok, detail = '') {
  if (ok) { passes++; console.log(`  ✓ ${name}`) }
  else { failures++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}

// الدوال تُستدعى بصلاحيات المالك (security definer) فلا يهمّ الدور؛ المهم auth.uid()
async function as(client, userId, fn, role = 'authenticated') {
  await client.query('begin')
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role })])
    const result = await fn()
    await client.query('rollback')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
}
async function errorOf(client, userId, sql, params = []) {
  try { await as(client, userId, () => client.query(sql, params)); return null } catch (e) { return e.message }
}
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
const can = (client, userId, key) =>
  as(client, userId, async () => (await client.query('select public.staff_can($1) as v', [key])).rows[0].v)

// ---------------------------------------------------------------------------
// النسخ البديلة: سطر الفحص كما هو في الإنتاج، والجسم بعده «ok»
// ---------------------------------------------------------------------------
const PRINT_FUNCS = []
for (const branch of ['tailoring', 'alterations']) {
  PRINT_FUNCS.push(
    { name: `private.list_${branch}_print_stations_impl`, args: '', call: '()', style: 'perform' },
    { name: `private.create_${branch}_print_station_impl`, args: 'p_name text, p_priority integer', call: `('x', 1)`, style: 'assign' },
    { name: `private.rotate_${branch}_print_station_secret_impl`, args: 'p_station_id uuid', call: `(gen_random_uuid())`, style: 'perform' },
    { name: `private.set_${branch}_print_station_enabled_impl`, args: 'p_station_id uuid, p_enabled boolean', call: `(gen_random_uuid(), true)`, style: 'perform' },
    { name: `private.release_${branch}_print_station_lease_impl`, args: 'p_station_id uuid', call: `(gen_random_uuid())`, style: 'perform' },
    { name: `private.retry_${branch}_print_job_impl`, args: 'p_job_id uuid', call: `(gen_random_uuid())`, style: 'assign' },
    { name: `private.cancel_${branch}_print_job_impl`, args: 'p_job_id uuid', call: `(gen_random_uuid())`, style: 'assign' },
  )
}

function printStub(f) {
  const gate = f.style === 'assign'
    ? `DECLARE\r\n  v_admin_id uuid;\r\nBEGIN\r\n  v_admin_id := private.require_active_admin();\r\n`
    : `BEGIN\r\n  PERFORM private.require_active_admin();\r\n`
  return `create or replace function ${f.name}(${f.args}) returns jsonb language plpgsql security definer set search_path = '' as $fn$\r\n${gate}  RETURN '{"ok":true}'::jsonb;\r\nEND;\r\n$fn$;`
}

const INLINE_A = `EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role='admin' AND is_active)`
const INLINE_B = `EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND role='admin' AND is_active)`

const PAYROLL_STUBS = `
create or replace function public.save_tailoring_salary_settings(p_worker_id text, p_year integer, p_month integer, p_salary_type character varying, p_fixed_salary_value numeric, p_overtime_total numeric, p_apply_future boolean, p_only_if_missing boolean, p_operation_date date, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
BEGIN
  IF NOT ${INLINE_B} THEN
    RAISE EXCEPTION 'Only administrators can manage salary settings' USING ERRCODE='42501';
  END IF;
  RETURN '{"ok":true}'::jsonb;
END;
$fn$;

create or replace function public.record_tailoring_payroll_disbursement(p_worker_id text, p_year integer, p_month integer, p_operation_date date, p_request_id uuid, p_payment numeric, p_deduction numeric, p_note text, p_deduction_note text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
BEGIN
  IF NOT ${INLINE_A} THEN\r
    RAISE EXCEPTION 'Only administrators can record payroll' USING ERRCODE='42501';
  END IF;
  RETURN '{"ok":true}'::jsonb;
END;
$fn$;

create or replace function public.set_tailoring_payroll_suspension(p_worker_id uuid, p_year integer, p_month integer, p_suspended boolean, p_ongoing boolean default false)
returns void language plpgsql security definer set search_path = '' as $fn$
BEGIN
  IF NOT ${INLINE_A} THEN\r
    RAISE EXCEPTION 'Only administrators can change payroll suspension' USING ERRCODE='42501';
  END IF;
END;
$fn$;

create table if not exists public.worker_payroll_operations_stub (id uuid primary key, branch text, operation_type text);
insert into public.worker_payroll_operations_stub values
  ('${OP_TAILORING}', 'tailoring', 'salary_deduction'),
  ('${OP_FABRICS}', 'fabrics', 'salary_deduction')
on conflict do nothing;

create or replace function public.delete_worker_payroll_operation_unchecked(p_operation_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
DECLARE
  v_operation public.worker_payroll_operations_stub%ROWTYPE;
BEGIN
  SELECT * INTO v_operation FROM public.worker_payroll_operations_stub WHERE id = p_operation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operation not found'; END IF;
  IF v_operation.operation_type = 'salary_deduction' THEN
    IF NOT ${INLINE_A} THEN
      RAISE EXCEPTION 'Only administrators can delete a salary deduction' USING ERRCODE='42501';
    END IF;
    RETURN;
  END IF;
END;
$fn$;
`

const PAYROLL_CALLS = [
  { label: 'إعداد الراتب', sql: `select public.save_tailoring_salary_settings('w', 2026, 11, 'fixed', 1000, 0, false, false, current_date, null)` },
  { label: 'تسجيل صرف الراتب', sql: `select public.record_tailoring_payroll_disbursement('w', 2026, 11, current_date, gen_random_uuid(), 100, 0, null, null)` },
  { label: 'تعليق الراتب', sql: `select public.set_tailoring_payroll_suspension(gen_random_uuid(), 2026, 11, true)` },
  { label: 'دوال الرواتب ذات الفرع (التفصيل)', sql: `select private.assert_payroll_branch_access('tailoring')` },
  { label: 'حذف خصم راتب في التفصيل', sql: `select public.delete_worker_payroll_operation_unchecked('${OP_TAILORING}')` },
]

const TRACKED = [
  ...PRINT_FUNCS.map(f => f.name),
  'public.save_tailoring_salary_settings', 'public.record_tailoring_payroll_disbursement',
  'public.set_tailoring_payroll_suspension', 'public.delete_worker_payroll_operation_unchecked',
  'private.assert_payroll_branch_access',
]

async function sources(client) {
  const { rows } = await client.query(`
    select n.nspname || '.' || p.proname as name, md5(p.prosrc) as exact,
           md5(regexp_replace(p.prosrc, '\\s+', ' ', 'g')) as loose
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname || '.' || p.proname = any($1::text[])
       or (n.nspname = 'private' and p.proname = 'staff_permission_any_for_user')
       or (n.nspname = 'public' and p.proname = 'set_staff_permissions')`, [TRACKED])
  return Object.fromEntries(rows.map(r => [r.name, r]))
}

const denied = msg => /active_admin_required|print_station_permission_required|Only administrators|PAYROLL_FORBIDDEN/.test(msg || '')

async function gateChecks(client, who, userId, expectAllowed) {
  let ok = 0
  const bad = []
  for (const f of PRINT_FUNCS) {
    const e = await errorOf(client, userId, `select ${f.name}${f.call}`)
    if (expectAllowed ? e === null : denied(e)) ok++; else bad.push(`${f.name}: ${e}`)
  }
  check(`${who}: محطات الطباعة (${PRINT_FUNCS.length} دالة) ${expectAllowed ? 'مسموحة' : 'ممنوعة'}`,
    ok === PRINT_FUNCS.length, bad.join(' | '))
  for (const c of PAYROLL_CALLS) {
    const e = await errorOf(client, userId, c.sql)
    check(`${who}: ${c.label} ${expectAllowed ? 'مسموح' : 'ممنوع'}`, expectAllowed ? e === null : denied(e), e || 'no error')
  }
}

async function seed(client) {
  await client.query(`
    insert into public.users (id, email, role, is_active) values
      ('${U.admin}', 'a@x', 'admin', true),
      ('${U.gm}', 'g@x', 'worker', true),
      ('${U.gm2}', 'g2@x', 'worker', true),
      ('${U.wm}', 'w@x', 'worker', true),
      ('${U.tailor}', 't@x', 'worker', true),
      ('${U.gmInactive}', 'gi@x', 'worker', false),
      ('${U.fsm}', 'f@x', 'worker', true);
    insert into public.workers (user_id, worker_type, is_available) values
      ('${U.gm}', 'general_manager', true),
      ('${U.gm2}', 'general_manager', true),
      ('${U.wm}', 'workshop_manager', true),
      ('${U.tailor}', 'tailor', false),
      ('${U.gmInactive}', 'general_manager', true),
      ('${U.fsm}', 'fabric_store_manager', true);

    -- سياسات القراءة الحية على workers (الإنتاج 2026-11-24)
    alter table public.workers enable row level security;
    drop policy if exists "Admins can view all workers" on public.workers;
    drop policy if exists "Authenticated users can view available workers" on public.workers;
    drop policy if exists "Workers can view own profile" on public.workers;
    create policy "Admins can view all workers" on public.workers for select to authenticated using (public.is_admin());
    create policy "Authenticated users can view available workers" on public.workers for select to authenticated using (is_available = true);
    create policy "Workers can view own profile" on public.workers for select to authenticated using (user_id = auth.uid());
  `)
}

async function main() {
  const server = await startServer('gm-grants')
  let client
  try {
    client = await connect()
    await client.query(read(path.join(__dirname, 'replica-staff-permissions.sql')))
    await client.query(read(BASE_MIGRATION))
    for (const f of PRINT_FUNCS) await client.query(printStub(f))
    await client.query(PAYROLL_STUBS)
    await seed(client)

    // مدير عام لديه تخصيص قديم (كما في الإنتاج) — لا يجب أن يفتح المفتاحين
    await commitAs(client, U.admin, `select public.set_staff_permissions($1, '{"reports.view":false}'::jsonb)`, [U.gm2])

    const before = await sources(client)
    check('كل الدوال المتتبَّعة موجودة قبل الهجرة', Object.keys(before).length === TRACKED.length + 2, Object.keys(before).join(','))

    console.log('\nقبل الهجرة (للمقارنة)')
    await gateChecks(client, 'المدير العام', U.gm, false)

    console.log('\nتطبيق الهجرة')
    await client.query(read(MIGRATION))
    check('طُبّقت', true)
    await client.query(read(MIGRATION))
    check('إعادة التطبيق بلا أثر (idempotent)', true)

    const after = await sources(client)
    const unchanged = TRACKED.filter(n => n !== 'private.assert_payroll_branch_access' && before[n].exact === after[n].exact)
    check('تغيّرت الدوال الـ18 كلها', unchanged.length === 0, unchanged.join(','))
    const printSrc = (await client.query(`select count(*)::int n from pg_proc where prosrc like '%private.require_print_station_manager()%'`)).rows[0].n
    check('14 دالة طباعة تستعمل البوابة الجديدة', printSrc === 14, `n=${printSrc}`)

    console.log('\nالكتالوج')
    const cat = (await client.query(`select key, owner_only, default_worker_types, grant_only_worker_types from public.staff_permission_catalog where key = any($1)`, [KEYS])).rows
    check('غير مقفلتين، بلا افتراضي، للمدير العام صراحةً',
      cat.length === 2 && cat.every(r => r.owner_only === false && r.default_worker_types.length === 0 &&
        r.grant_only_worker_types.join() === 'general_manager'), JSON.stringify(cat))
    const n = (await client.query('select count(*)::int as n from public.staff_permission_catalog')).rows[0].n
    check('49 صلاحية كما هي', n === 49, `n=${n}`)

    console.log('\nلا منح تلقائي')
    for (const key of KEYS) {
      check(`المدير العام بلا تخصيص: ${key} = لا`, await can(client, U.gm, key) === false)
      check(`المدير العام بتخصيص قديم: ${key} = لا`, await can(client, U.gm2, key) === false)
      check(`المدير الأكبر: ${key} = نعم`, await can(client, U.admin, key) === true)
    }
    check('المدير العام ما زال يملك غير المقفل افتراضياً', await can(client, U.gm, 'orders.create') === true)
    check('المقفل الآخر ما زال مقفلاً', await can(client, U.gm, 'workers.manage') === false)
    await gateChecks(client, 'المدير العام قبل المنح', U.gm, false)
    await gateChecks(client, 'المدير الأكبر', U.admin, true)
    await gateChecks(client, 'الخياط', U.tailor, false)

    console.log('\nالمنح')
    await commitAs(client, U.admin, `select public.set_staff_permissions($1, $2::jsonb)`,
      [U.gm, JSON.stringify({ 'accounting.tailoring.salaries': true, 'settings.print_stations': true, 'orders.delete': false })])
    const gmStored = (await client.query('select overrides from public.staff_permissions where user_id = $1', [U.gm])).rows[0]?.overrides
    check('المنح مخزّن للمدير العام', gmStored?.['accounting.tailoring.salaries'] === true && gmStored?.['settings.print_stations'] === true, JSON.stringify(gmStored))
    for (const key of KEYS) check(`المدير العام الممنوح: ${key} = نعم`, await can(client, U.gm, key) === true)
    check('الإطفاء العادي يعمل معه', await can(client, U.gm, 'orders.delete') === false)
    await gateChecks(client, 'المدير العام الممنوح', U.gm, true)
    const fabricsDeduction = await errorOf(client, U.gm, `select public.delete_worker_payroll_operation_unchecked('${OP_FABRICS}')`)
    check('المدير العام الممنوح: حذف خصم راتب في فرع آخر ممنوع', denied(fabricsDeduction), fabricsDeduction || 'no error')
    const adminFabrics = await errorOf(client, U.admin, `select public.delete_worker_payroll_operation_unchecked('${OP_FABRICS}')`)
    check('المدير الأكبر: حذف خصم في فرع آخر كما كان', adminFabrics === null, adminFabrics || '')
    const otherBranch = await errorOf(client, U.gm, `select private.assert_payroll_branch_access('women_workshop')`)
    check('المدير العام الممنوح: رواتب فرع غير مذكور ممنوعة', denied(otherBranch), otherBranch || 'no error')
    const mine = await as(client, U.gm, async () => (await client.query('select public.get_my_staff_permissions() as v')).rows[0].v)
    check('get_my_staff_permissions يعكس المنح', mine?.permissions['accounting.tailoring.salaries'] === true && mine?.permissions['settings.print_stations'] === true)
    check('المدير العام الآخر لم يتأثر', await can(client, U.gm2, 'settings.print_stations') === false)

    console.log('\nأنواع أخرى')
    await commitAs(client, U.admin, `select public.set_staff_permissions($1, $2::jsonb)`,
      [U.wm, JSON.stringify({ 'accounting.tailoring.salaries': true, 'settings.print_stations': true, 'orders.edit': true })])
    const wmStored = (await client.query('select overrides from public.staff_permissions where user_id = $1', [U.wm])).rows[0]?.overrides
    check('مدير الورشة: المنح لا يُخزَّن والباقي يُخزَّن',
      wmStored && !('accounting.tailoring.salaries' in wmStored) && !('settings.print_stations' in wmStored) && wmStored['orders.edit'] === true,
      JSON.stringify(wmStored))
    // تخصيص مزروع مباشرة (تجاوزاً للدالة) — الحساب نفسه يرفضه
    await client.query(`update public.staff_permissions set overrides = overrides || '{"accounting.tailoring.salaries":true,"settings.print_stations":true}' where user_id = $1`, [U.wm])
    for (const key of KEYS) check(`مدير الورشة بتخصيص مزروع: ${key} = لا`, await can(client, U.wm, key) === false)
    await gateChecks(client, 'مدير الورشة بتخصيص مزروع', U.wm, false)
    await client.query(`insert into public.staff_permissions (user_id, overrides) values ($1, '{"accounting.tailoring.salaries":true,"settings.print_stations":true}')`, [U.gmInactive])
    for (const key of KEYS) check(`مدير عام موقوف ممنوح: ${key} = لا`, await can(client, U.gmInactive, key) === false)
    const fsmFabrics = await errorOf(client, U.fsm, `select private.assert_payroll_branch_access('fabrics')`)
    check('مدير الأقمشة: رواتب الأقمشة كما كانت', fsmFabrics === null, fsmFabrics || '')
    const fsmTailoring = await errorOf(client, U.fsm, `select private.assert_payroll_branch_access('tailoring')`)
    check('مدير الأقمشة: رواتب التفصيل ممنوعة', denied(fsmTailoring), fsmTailoring || 'no error')

    console.log('\nقراءة العمال للرواتب')
    const visible = uid => as(client, uid, async () => {
      await client.query('set local role authenticated')
      return (await client.query('select count(*)::int n from public.workers')).rows[0].n
    })
    check('المدير العام الممنوح يرى العامل غير المتاح', await visible(U.gm) === 6)
    check('المدير العام غير الممنوح لا يرى غير المتاح', await visible(U.gm2) === 5)

    console.log('\nالتراجع')
    await client.query(read(ROLLBACK))
    check('طُبّق', true)
    await client.query(read(ROLLBACK))
    check('إعادة التراجع بلا أثر', true)
    const back = await sources(client)
    const notExact = TRACKED.filter(n => n !== 'private.assert_payroll_branch_access' && back[n].exact !== before[n].exact)
    check('الدوال الـ18 عادت حرفياً', notExact.length === 0, notExact.join(','))
    const notLoose = ['private.assert_payroll_branch_access', 'private.staff_permission_any_for_user', 'public.set_staff_permissions']
      .filter(n => back[n].loose !== before[n].loose)
    check('البوابة المركزية والحساب والحفظ كما كانت', notLoose.length === 0, notLoose.join(','))
    const catBack = (await client.query(`select bool_and(owner_only) v from public.staff_permission_catalog where key = any($1)`, [KEYS])).rows[0].v
    check('المفتاحان مقفلان من جديد', catBack === true)
    const col = (await client.query(`select count(*)::int n from information_schema.columns where table_name = 'staff_permission_catalog' and column_name = 'grant_only_worker_types'`)).rows[0].n
    check('العمود حُذف', col === 0)
    const gmAfter = (await client.query('select overrides from public.staff_permissions where user_id = $1', [U.gm])).rows[0].overrides
    check('حُذف المنح وبقي باقي التخصيص', !('accounting.tailoring.salaries' in gmAfter) && !('settings.print_stations' in gmAfter) && gmAfter['orders.delete'] === false, JSON.stringify(gmAfter))
    await gateChecks(client, 'المدير العام بعد التراجع', U.gm, false)
    await gateChecks(client, 'المدير الأكبر بعد التراجع', U.admin, true)
    const helpers = (await client.query(`select count(*)::int n from pg_proc where proname in ('can_manage_tailoring_payroll','require_print_station_manager')`)).rows[0].n
    check('البوابتان الجديدتان حُذفتا', helpers === 0)

    console.log('\nإعادة التطبيق بعد التراجع')
    await client.query(read(MIGRATION))
    for (const key of KEYS) check(`بعد إعادة التطبيق: المدير العام ${key} = لا (المنح لا يعود وحده)`, await can(client, U.gm, key) === false)

    // فحص الحارس: نص غير متوقع = توقف الهجرة كلها
    await client.query(read(ROLLBACK))
    await client.query(`create or replace function private.list_tailoring_print_stations_impl() returns jsonb language plpgsql security definer set search_path = '' as $fn$ BEGIN PERFORM private.require_active_admin(); PERFORM private.require_active_admin(); RETURN '{}'::jsonb; END; $fn$`)
    const guard = await client.query(read(MIGRATION)).then(() => null, e => e.message)
    await client.query('rollback').catch(() => {})
    check('نص مكرر = الهجرة ترفض ولا يتغيّر شيء', /expected 1/.test(guard || ''), guard || 'applied!')
    const stillLocked = (await client.query(`select owner_only from public.staff_permission_catalog where key = 'settings.print_stations'`)).rows[0].owner_only
    check('الكتالوج لم يتغيّر بعد الرفض', stillLocked === true)
  } finally {
    if (client) await client.end().catch(() => {})
    console.log(`\n${passes} ناجح، ${failures} فاشل`)
    await finish(server, failures ? 1 : 0)
  }
}

main().catch(async e => { console.error(e); process.exit(1) })
