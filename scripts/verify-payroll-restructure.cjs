// Run with PAYROLL_PGLITE_PATH pointing to an isolated installation of @electric-sql/pglite.
// No connection to Supabase or production records is made.
const { readFileSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { PGlite } = require(process.env.PAYROLL_PGLITE_PATH || path.join(process.env.TEMP, 'yasmin-payroll-verification/node_modules/@electric-sql/pglite'))
const read = file => readFileSync(path.join(__dirname, '..', file), 'utf8')
async function main() {
  const db = new PGlite()
  await db.exec(read('supabase/tests/payroll-restructure-fixture.sql'))
  const source = read('supabase/migrations/20260825115729_sync_piecework_payroll_from_worker_pricing.sql')
  await db.exec(source.slice(0, source.indexOf('-- Refresh only this open calendar month.')) + '\nCOMMIT;')
  await db.exec(read('supabase/migrations/20260825121500_harden_piecework_payroll_total_trigger.sql'))
  await db.exec('CREATE TRIGGER trg_sync_worker_payroll_month_totals BEFORE INSERT OR UPDATE ON public.worker_payroll_months FOR EACH ROW EXECUTE FUNCTION public.sync_worker_payroll_month_totals()')
  await db.exec(read('supabase/migrations/20260906074151_simplify_tailoring_payroll.sql'))
  const a = '00000000-0000-4000-8000-000000000001', b = '00000000-0000-4000-8000-000000000002', order = '00000000-0000-4000-8000-000000000003'
  await db.exec(`INSERT INTO users(id,full_name,role) VALUES('${a}','Fixture A','worker'),('${b}','Fixture B','worker'); INSERT INTO workers VALUES('${a}','${a}','tailor'),('${b}','${b}','tailor');
    INSERT INTO worker_payroll_months(branch,worker_id,worker_name,payroll_year,payroll_month,salary_type,total_paid,advances_total,overtime_total)
    VALUES('tailoring','${a}','Fixture A',2026,9,'piecework',40,7,5),('tailoring','${b}','Fixture B',2026,9,'piecework',0,0,0);`)
  const month = async (worker = a, m = 9) => (await db.query('SELECT * FROM worker_payroll_months WHERE worker_id=$1 AND payroll_month=$2', [worker, m])).rows[0]
  await db.exec(`INSERT INTO orders VALUES('${order}','${a}',100,10,'2026-09-06T12:00:00Z','completed')`)
  assert.equal(Number((await month()).piece_total), 110)
  assert.equal(Number((await month()).remaining_due), 68)
  await db.exec(`UPDATE orders SET worker_price=0 WHERE id='${order}'`)
  assert.equal(Number((await month()).piece_total), 0, 'Explicit zero must clear a previous price')
  assert.equal(Number((await month()).total_paid), 40, 'Pricing updates preserve payments')
  assert.equal(Number((await month()).advances_total), 7, 'Historical salary adjustments are preserved')
  await db.exec(`UPDATE orders SET worker_price=50,worker_bonus=5 WHERE id='${order}'`)
  assert.equal(Number((await month()).piece_total), 55)
  await db.exec(`UPDATE orders SET worker_completed_at='2026-10-01T12:00:00Z' WHERE id='${order}'`)
  assert.equal(Number((await month(a, 9)).piece_total), 0, 'Moving completion removes pricing from old month')
  assert.equal(Number((await month(a, 10)).piece_total), 55, 'Moving completion creates the correct new month automatically')
  await db.exec(`UPDATE orders SET worker_id='${b}' WHERE id='${order}'`)
  assert.equal(Number((await month(a, 10)).piece_total), 0)
  assert.equal(Number((await month(b, 10)).piece_total), 55)
  await db.exec(`UPDATE orders SET status='in_progress' WHERE id='${order}'`)
  assert.equal(Number((await month(b, 10)).piece_total), 0, 'Reopened work no longer contributes to completed pay')
  await db.exec(`UPDATE orders SET status='delivered' WHERE id='${order}'`)
  assert.equal(Number((await month(b, 10)).piece_total), 55)
  await db.exec(`DELETE FROM orders WHERE id='${order}'`)
  assert.equal(Number((await month(b, 10)).piece_total), 0)
  await assert.rejects(db.exec("SELECT lock_worker_payroll_period('tailoring',2026,9)"))
  await assert.rejects(db.exec("UPDATE worker_payroll_months SET is_locked=true WHERE branch='tailoring'"))
  await assert.rejects(db.exec("INSERT INTO worker_payroll_operations(branch,operation_type) VALUES('tailoring','advance')"))
  assert.equal((await db.query("SELECT is_worker_payroll_period_locked('tailoring',2026,9) AS locked")).rows[0].locked, false)
  await db.exec("INSERT INTO worker_payroll_period_locks(branch,payroll_year,payroll_month,is_locked) VALUES('fabrics',2026,9,true)")
  assert.equal((await db.query("SELECT is_worker_payroll_period_locked('fabrics',2026,9) AS locked")).rows[0].locked, true, 'Other branches retain their behavior')
  const previous = await db.query("SELECT * FROM get_worker_payroll_previous_context('tailoring',2026,10)")
  assert.equal(previous.rows.length, 2)
  await db.exec(`INSERT INTO worker_payroll_persistent_suspensions VALUES('tailoring','${b}',2026,10)`)
  const report = await db.query("SELECT * FROM get_worker_payroll_report_months('tailoring','2026-09-01','2026-10-31')")
  assert.equal(report.rows.length, 3, 'Reports honor suspension starting month without hiding previous months')
  const events = (await db.query('SELECT * FROM worker_payroll_pricing_events')).rows
  assert(events.length >= 8, 'Automatic pricing changes produce an audit trail')
  await db.exec('GRANT USAGE ON SCHEMA auth TO authenticated; GRANT SELECT ON users,workers TO authenticated; SET ROLE authenticated;')
  assert.equal((await db.query('SELECT * FROM worker_payroll_pricing_events')).rows.length, 0, 'Unrelated authenticated users cannot read the audit trail')
  await db.exec(`SELECT set_config('test.user_id','${a}',false)`)
  assert((await db.query('SELECT * FROM worker_payroll_pricing_events')).rows.every(row => row.worker_id === a), 'Workers only see their own audit entries')
  await db.exec('RESET ROLE')
  await db.exec(read('supabase/tests/payroll-settings-dependencies.sql'))
  await db.exec(read('supabase/migrations/20260906083047_atomic_tailoring_salary_settings.sql'))
  await assert.rejects(db.exec(`SELECT save_tailoring_salary_settings('${a}',2026,9,'fixed',1000)`), /Only administrators/)
  await db.exec(`UPDATE users SET role='admin' WHERE id='${a}'; UPDATE worker_payroll_months SET allowances_total=3,deductions_total=11 WHERE worker_id='${a}' AND payroll_month=9`)
  await db.exec(`SELECT save_tailoring_salary_settings('${a}',2026,9,'fixed',1000,12,true,false,'2026-09-06')`)
  const saved = await month(a,9)
  assert.equal(Number(saved.total_paid),40)
  assert.equal(Number(saved.advances_total),7)
  assert.equal(Number(saved.allowances_total),3)
  assert.equal(Number(saved.deductions_total),11)
  assert.equal(Number(saved.overtime_total),12)
  assert.equal(Number(saved.basic_salary),1000)
  assert.equal(Number((await month(a,10)).works_total),Number((await month(a,10)).overtime_total), 'Future fixed salary removes stale piecework subtotal')
  const operationCount = Number((await db.query('SELECT count(*) FROM worker_payroll_operations')).rows[0].count)
  await db.exec(`SELECT save_tailoring_salary_settings('${a}',2026,9,'fixed',2000,99,false,true,'2026-09-06')`)
  assert.equal(Number((await month(a,9)).fixed_salary_value),1000,'Preparation never overwrites a concurrently created month')
  assert.equal(Number((await db.query('SELECT count(*) FROM worker_payroll_operations')).rows[0].count),operationCount,'Repeated preparation creates no duplicate entries')
  await db.exec(`CREATE FUNCTION public.fixture_fail_future() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payroll_month=10 THEN RAISE EXCEPTION 'fixture future failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_fail_future BEFORE UPDATE ON public.worker_payroll_months FOR EACH ROW EXECUTE FUNCTION public.fixture_fail_future()`)
  await assert.rejects(db.exec(`SELECT save_tailoring_salary_settings('${a}',2026,9,'fixed',1500,12,true,false,'2026-09-06')`), /fixture future failure/)
  assert.equal(Number((await month(a,9)).fixed_salary_value),1000,'Future update failure rolls back current salary too')
  assert.equal(Number((await db.query('SELECT count(*) FROM worker_payroll_operations')).rows[0].count),operationCount,'Failed settings leave no partial ledger entries')
  await db.exec(`DROP TRIGGER fixture_fail_future ON worker_payroll_months;
    ALTER TABLE orders ADD COLUMN admin_completed_at timestamptz, ADD COLUMN delivery_date date;
    ALTER TABLE worker_payroll_operations ADD CONSTRAINT worker_payroll_operations_operation_type_check CHECK(operation_type IN ('salary','payment','advance','deduction'));
    ALTER TABLE worker_payroll_operations ADD COLUMN created_at timestamptz DEFAULT now();
    CREATE UNIQUE INDEX uq_worker_payroll_payment_duplicate ON worker_payroll_operations(branch,worker_id,payroll_year,payroll_month,operation_date,amount,COALESCE(metadata->>'debt_settlement','false')) WHERE operation_type='payment';
    CREATE UNIQUE INDEX fixture_operation_reference ON worker_payroll_operations(reference);
    ALTER TABLE worker_payroll_suspensions ADD COLUMN worker_name text, ADD COLUMN suspended_by uuid, ADD COLUMN reason text, ADD UNIQUE(branch,worker_id,payroll_year,payroll_month);
    ALTER TABLE worker_payroll_persistent_suspensions ADD COLUMN worker_name text, ADD COLUMN suspended_by uuid, ADD COLUMN updated_at timestamptz, ADD UNIQUE(branch,worker_id);
    INSERT INTO orders(id,worker_id,worker_price,status,delivery_date) VALUES('${order}','${b}',160,'delivered','2026-09-06');`)
  await db.exec(read('supabase/tests/payroll-disbursement-dependencies.sql'))
  await db.exec(`INSERT INTO users(id,full_name,role) VALUES('00000000-0000-4000-8000-000000000004','Legacy fixture','worker');
    INSERT INTO workers VALUES('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004','tailor');
    ALTER TABLE worker_payroll_months DISABLE TRIGGER trg_enforce_piecework_payroll_pricing_source;
    INSERT INTO worker_payroll_months(branch,worker_id,worker_name,payroll_year,payroll_month,salary_type,piece_total,works_total)
    VALUES('tailoring','00000000-0000-4000-8000-000000000004','Legacy fixture',2026,9,'piecework',500,500);
    ALTER TABLE worker_payroll_months ENABLE TRIGGER trg_enforce_piecework_payroll_pricing_source;
    INSERT INTO orders(id,worker_id,worker_price,status,delivery_date) VALUES('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000004',200,'delivered','2026-09-06');
    ALTER TABLE worker_payroll_operations ADD COLUMN is_approved boolean DEFAULT true;
    CREATE FUNCTION fixture_immutable_operations() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF COALESCE(current_setting('app.bypass_trigger',true),'')='true' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
      IF OLD.is_approved THEN RAISE EXCEPTION 'Approved payroll operations cannot be changed'; END IF;
      RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
    END $$;
    CREATE TRIGGER fixture_immutable_operations BEFORE UPDATE OR DELETE ON worker_payroll_operations FOR EACH ROW EXECUTE FUNCTION fixture_immutable_operations();`)
  await db.exec(read('supabase/migrations/20260906120650_payroll_payments_suspensions_and_delivery.sql'))
  await db.exec(read('supabase/migrations/20260906134400_preserve_payroll_debt_settlement_deduplication.sql'))
  assert.equal(Number((await month('00000000-0000-4000-8000-000000000004',9)).piece_total),500,'Backfill preserves higher legacy snapshots rather than reducing their entitlement')
  assert.equal(Number((await month(b,9)).piece_total),160,'Migration backfills delivered work with no worker completion date')
  await db.exec(`UPDATE orders SET delivery_date='2026-10-02' WHERE id='${order}'`)
  assert.equal(Number((await month(b,9)).piece_total),0)
  assert.equal(Number((await month(b,10)).piece_total),160,'Delivery-date changes move the salary to the correct month')
  await db.exec(`UPDATE orders SET admin_completed_at='2026-09-05T12:00:00Z' WHERE id='${order}'`)
  assert.equal(Number((await month(b,9)).piece_total),160,'Admin completion date has priority over delivery date')
  assert.equal(Number((await month(b,10)).piece_total),0)
  await db.exec(`UPDATE worker_payroll_months SET basic_salary=1000,works_total=0,overtime_total=0,allowances_total=0,advances_total=0,total_paid=0 WHERE worker_id='${a}' AND payroll_month=9`)
  const requestOne='00000000-0000-4000-8000-000000000011', requestTwo='00000000-0000-4000-8000-000000000012', requestCut='00000000-0000-4000-8000-000000000013'
  const pay = (id,value=500) => db.exec(`SELECT record_tailoring_payroll_disbursement('${a}',2026,9,'2026-09-06','${id}',${value})`)
  await pay(requestOne)
  await pay(requestOne)
  assert.equal(Number((await month(a,9)).total_paid),500,'Retrying a saved request never duplicates payment')
  await pay(requestTwo)
  const settlementFixture = `INSERT INTO worker_payroll_operations(branch,worker_id,payroll_year,payroll_month,operation_type,operation_date,amount,metadata)
    VALUES('tailoring','${a}',2026,9,'payment','2026-09-06',5,'{"debt_settlement":true}')`
  await db.exec(settlementFixture)
  await assert.rejects(db.exec(settlementFixture), /uq_worker_payroll_payment_duplicate/)
  assert.equal(Number((await month(a,9)).remaining_due),0,'Two separate 500 payments on the same day are allowed')
  await assert.rejects(pay(requestOne,400), /different details/)
  await db.exec(`SELECT record_tailoring_payroll_disbursement('${b}',2026,9,'2026-09-06','${requestCut}',100,20,NULL,'Fixture absence deduction')`)
  assert.equal(Number((await month(b,9)).salary_deductions_total),20)
  assert.equal(Number((await month(b,9)).net_due),140)
  assert.equal(Number((await month(b,9)).total_paid),100)
  await db.exec(`CREATE FUNCTION fixture_fail_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation_type='payment' THEN RAISE EXCEPTION 'fixture payment failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fixture_fail_payment BEFORE INSERT ON worker_payroll_operations FOR EACH ROW EXECUTE FUNCTION fixture_fail_payment()`)
  await assert.rejects(db.exec(`SELECT record_tailoring_payroll_disbursement('${b}',2026,9,'2026-09-06','00000000-0000-4000-8000-000000000014',5,5,NULL,'Fixture rollback')`),/fixture payment failure/)
  assert.equal(Number((await month(b,9)).salary_deductions_total),20,'Payment failure rolls back its accompanying deduction and preserves the earlier deduction')
  await db.exec('DROP TRIGGER fixture_fail_payment ON worker_payroll_operations')
  assert.equal(Number((await month(b,9)).remaining_due),40,'Deduction reduces entitlement, not cash payments or debt')
  await db.exec(`SELECT record_tailoring_payroll_disbursement('${b}',2026,9,'2026-09-06','${requestCut}',100,20,NULL,'Fixture absence deduction')`)
  assert.equal(Number((await month(b,9)).salary_deductions_total),20)
  const cutId=(await db.query("SELECT id FROM worker_payroll_operations WHERE reference=$1",['CUT-'+requestCut])).rows[0].id
  await db.exec(`SELECT delete_worker_payroll_operation('${cutId}')`)
  assert.equal(Number((await month(b,9)).net_due),160,'Deleting the deduction restores entitlement only')
  assert.equal(Number((await month(b,9)).total_paid),100)
  await db.exec(`SELECT set_tailoring_payroll_suspension('${a}',2026,7,true,true); SELECT set_tailoring_payroll_suspension('${a}',2026,9,false)`)
  const past=(await db.query(`SELECT payroll_month FROM worker_payroll_suspensions WHERE worker_id='${a}' ORDER BY payroll_month`)).rows
  assert.deepEqual(past.map(x=>x.payroll_month),[7,8],'Resuming preserves every earlier vacation month')
  await db.exec(`SELECT set_tailoring_payroll_suspension('${a}',2026,10,true,false)`)
  assert.equal((await db.query(`SELECT count(*) FROM worker_payroll_persistent_suspensions WHERE worker_id='${a}'`)).rows[0].count,0)
  await db.exec(`SELECT set_tailoring_payroll_suspension('${a}',2026,10,false)`)
  assert.equal((await db.query(`SELECT count(*) FROM worker_payroll_suspensions WHERE worker_id='${a}'`)).rows[0].count,2)
  await db.exec(`UPDATE users SET role='worker' WHERE id='${a}'`)
  await assert.rejects(pay('00000000-0000-4000-8000-000000000099'),/Only administrators/)
  await assert.rejects(db.exec(`SELECT set_tailoring_payroll_suspension('${b}',2026,9,true)`),/Only administrators/)
  await db.close()
  console.log('PASS: same-day separate payments, retry safety, salary deductions/reversal, monthly suspension history and manager-delivered piecework backfill.')
  console.log('PASS: automatic price/bonus sync, zero clearing, month/worker changes, reopening/deletion, payment/history preservation, retired locks/advances, report suspensions, audit trail, RLS, admin-only atomic settings and idempotent preparation.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
