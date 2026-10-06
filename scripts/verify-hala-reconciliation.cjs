// Read-only verification. Optional --pdf path tests the actual PDF extractor.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url')
const ts=require('typescript')
const root=path.resolve(__dirname,'..')
function load(file,overrides={}) {
  const source=fs.readFileSync(path.join(root,file),'utf8')
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const module={exports:{}}
  const customRequire=id=>Object.hasOwn(overrides,id)?overrides[id]:require(id)
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file})(customRequire,module,module.exports)
  return module.exports
}
const lib=load('src/lib/hala-reconciliation.ts')
const view=load('src/lib/hala-report-view.ts')
const pagination=load('src/lib/server/hala-read-all.ts')
const tailoring=load('src/lib/server/hala-tailoring.ts',{'@/lib/payment-breakdown':load('src/lib/payment-breakdown.ts'),'@/lib/hala-reconciliation':lib})
const prefix='Transactions Export\nFrom Date 01/10/2026 12:00 AM\nTo Date 05/10/2026 11:59 PM\n'
const ref1='17908719593276644466',ref2='17908719934936409167'
const line=(ref=ref1,amt='50.00',no=1)=>`${no} 01/10/2026 7:25 PM ${ref} Approved MPOS to Merchant Topup mada 1656601901300001 ${amt}\n`
const site=(id='a',notes='',amount=5000)=>({id,branch:'women',date:'2026-10-01',amount,invoice:'INV',notes,settlement:false})
async function main(){
  assert.equal(lib.toHalalas('1,200.01'),120001);assert.throws(()=>lib.toHalalas('NaN'))
  assert.throws(()=>lib.dateRange('2026-02-30','2026-10-04'))
  assert.deepEqual(lib.dateRange('2026-10-01','2026-10-01'),{from:'2026-09-30T21:00:00.000Z',until:'2026-10-01T21:00:00.000Z'})
  assert.throws(()=>lib.parseHalaText(prefix+line().replace('Approved MPOS','Approved Unknown MPOS')))
  const parsed=lib.parseHalaText(prefix+line())
  assert.equal(lib.reconcileHala(parsed,[], '2026-10-01','2026-10-01').bankRows[0].status,'missing')
  const sameDay=lib.reconcileHala(parsed,[site()], '2026-10-01','2026-10-01')
  assert.equal(sameDay.bankRows[0].status,'day');assert.equal(sameDay.summary[0].reviewCount,0)
  assert.equal(lib.reconcileHala({...parsed,entries:parsed.entries.map(e=>({...e,time:'00:01'}))},[site()], '2026-10-01','2026-10-01').bankRows[0].status,'day')
  assert.equal(lib.reconcileHala(parsed,[{...site(),date:'2026-10-02'}], '2026-10-01','2026-10-02').bankRows[0].status,'missing')
  assert.equal(lib.reconcileHala(parsed,[site('a','',5100)], '2026-10-01','2026-10-01').bankRows[0].status,'missing')
  assert.equal(lib.reconcileHala(parsed,[site('a','مرجع الشبكة '+ref1)], '2026-10-01','2026-10-01').bankRows[0].status,'reference')
  assert.equal(lib.reconcileHala(parsed,[site('a',ref1,8500)], '2026-10-01','2026-10-01').bankRows[0].status,'review')
  const duplicate=lib.parseHalaText(prefix+line()+line(ref1,'50.00',2))
  assert.equal(duplicate.entries.length,1);assert.equal(duplicate.duplicates.length,1)
  assert.throws(()=>lib.parseHalaText(prefix+line()+line(ref1,'60.00',2)))
  const repeat=lib.parseHalaText(prefix+line()+line(ref2,'50.00',2))
  const ambiguous=lib.reconcileHala(repeat,[site()], '2026-10-01','2026-10-01')
  assert.deepEqual(ambiguous.bankRows.map(r=>r.status),['day','missing'])
  const balanced=lib.reconcileHala(repeat,[site('a'),site('b')], '2026-10-01','2026-10-01')
  assert(balanced.bankRows.every(r=>r.status==='day'));assert.equal(balanced.unmatchedSite.length,0)
  assert.equal(new Set(balanced.bankRows.map(r=>r.site.id)).size,2)
  const surplus=lib.reconcileHala(parsed,[site('a'),site('b')], '2026-10-01','2026-10-01')
  assert.equal(surplus.bankRows[0].status,'day');assert.equal(surplus.unmatchedSite.length,1)
  const multiref=lib.reconcileHala(repeat,[site('a',ref1+' '+ref2)], '2026-10-01','2026-10-01')
  assert(multiref.bankRows.every(r=>r.status==='review'))
  const settled=lib.reconcileHala(parsed,[{...site('s','RECON-NET80'),settlement:true}], '2026-10-01','2026-10-01')
  assert.equal(settled.summary[0].difference,0);assert.equal(settled.bankRows[0].status,'missing');assert.equal(settled.settlements.length,1)
  assert.throws(()=>lib.reconcileHala(parsed,[], '2026-09-30','2026-10-01'))
  assert.equal(lib.reconcileHala(lib.parseHalaText(prefix+line().replace('1656601901300001','9999999999999999')),[], '2026-10-01','2026-10-01').bankRows[0].status,'unmapped')
  const tailoringBank=lib.parseHalaText(prefix+line().replace('1656601901300001','1658362601300001'))
  assert.equal(tailoringBank.entries[0].branch,'tailoring')
  assert.equal(lib.reconcileHala(tailoringBank,[site()], '2026-10-01','2026-10-01').bankRows[0].status,'missing')
  assert.equal(lib.reconcileHala(tailoringBank,[{...site(),branch:'tailoring'}], '2026-10-01','2026-10-01').bankRows[0].status,'day')
  const dailyReport=lib.reconcileHala(parsed,[site('match'),{...site('next'),date:'2026-10-02'},{...site('settlement'),date:'2026-10-02',amount:8000,settlement:true},{...site('third'),branch:'fabrics',date:'2026-10-03'}],'2026-10-01','2026-10-03')
  const days=view.halaReportDays(dailyReport,'all','all')
  assert.deepEqual(days.map(d=>[d.date,d.tone]),[['2026-10-01','green'],['2026-10-02','yellow'],['2026-10-03','green']])
  assert.equal(days[0].bankAmount,5000);assert.equal(days[0].siteAmount,5000);assert.equal(days[0].siteCount,1)
  assert.equal(days[1].bankAmount,0);assert.equal(days[1].siteAmount,13000);assert.equal(days[1].siteCount,2)
  assert.deepEqual(days[1].rows.map(r=>r.status),['site-only','settlement'])
  assert(days[1].rows.every(r=>r.bank===null&&r.site.date==='2026-10-02'))
  assert.equal(view.halaReportDays(dailyReport,'women','matched').flatMap(d=>d.rows).length,1)
  const issues=view.halaReportDays(dailyReport,'women','issues')
  assert.equal(issues.length,1);assert.equal(issues[0].date,'2026-10-02');assert.equal(issues[0].tone,'yellow')
  assert.equal(issues[0].rows.length,1);assert.equal(issues[0].siteAmount,13000)
  assert.equal(view.halaReportDays(dailyReport,'fabrics','all')[0].rows[0].site.branch,'fabrics')
  assert.equal(view.halaReportDays(dailyReport,'unmapped','all').length,0)
  console.log('PASS day matching and report: hours ignored, other dates/amounts rejected, repeated payments paired once, daily colors/totals, site-only/settlement rows and combined filters.')
  const order={id:'o1',branch:'tailoring',status:'delivered',order_number:'ORDER-1',order_received_date:'2026-10-01',delivery_date:'2026-10-03',created_at:'2026-09-30T23:00:00Z',updated_at:'2026-10-03T20:00:00Z',paid_amount:400,pre_delivery_cash_amount:50,pre_delivery_network_amount:200,remaining_cash_amount:50,remaining_network_amount:100,alostaz_deposit_invoice_code:'DEPOSIT',alostaz_invoice_code:'DELIVERY'}
  const extras=[{id:'p1',branch:'tailoring',order_id:'o1',method:'card',amount:50,occurred_at:'2026-10-01T21:30:00Z',alostaz_invoice_code:'EXTRA'}, {id:'p0',branch:'tailoring',order_id:'o1',method:'card',amount:25,occurred_at:'2026-09-30T10:00:00Z',alostaz_invoice_code:'OLD'}]
  const phases=tailoring.tailoringHalaEntries([order],extras,'2026-10-01','2026-10-04')
  assert.deepEqual(phases.entries.map(e=>[e.date,e.amount,e.invoice]),[['2026-10-01',12500,'DEPOSIT'],['2026-10-02',5000,'EXTRA'],['2026-10-03',10000,'DELIVERY']])
  assert.equal(tailoring.tailoringHalaEntries([{...order,status:'cancelled'}],extras,'2026-10-01','2026-10-04').entries.length,0)
  assert.equal(tailoring.tailoringHalaEntries([{...order,order_received_date:null}],extras,'2026-10-01','2026-10-04').warnings.length,1)
  assert.equal(tailoring.halaRiyadhDate('2026-10-01T21:30:00Z'),'2026-10-02')

  let auth={ok:false,response:Response.json({error:'unauthorized'},{status:401})},reads=0,tables={}
  const route=load('src/app/api/accounting/hala-reconciliation/route.ts',{
    '@/lib/hala-reconciliation':lib,
    '@/lib/server/hala-read-all':pagination,
    '@/lib/server/hala-tailoring':tailoring,
    '@/lib/server/api-auth':{requireActiveStaff:async()=>auth},
    '@supabase/supabase-js':{createClient:()=>{reads++;return {from:table=>{
      const predicates=[],builder={};for(const method of ['select','order'])builder[method]=()=>builder
      for(const method of ['eq','gte','lt','lte','in','not'])builder[method]=(column,value,other)=>{predicates.push(r=>method==='eq'?r[column]===value:method==='gte'?r[column]>=value:method==='lt'?r[column]<value:method==='lte'?r[column]<=value:method==='in'?value.includes(r[column]):r[column]!==other);return builder}
      builder.range=async(from,to)=>({data:(tables[table]??[]).filter(r=>predicates.every(p=>p(r))).slice(from,to+1),error:null});return builder
    }}}},
  })
  const request=body=>new Request('http://localhost/api/accounting/hala-reconciliation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  const body={text:prefix+line(),start:'2026-10-01',end:'2026-10-01'}
  assert.equal((await route.POST(request(body))).status,401);assert.equal(reads,0)
  auth={ok:true,staff:{role:'worker'}}
  assert.equal((await route.POST(request(body))).status,403);assert.equal(reads,0)
  auth={ok:true,staff:{role:'admin'}}
  assert.equal((await route.POST(request({...body,start:'invalid'}))).status,400);assert.equal(reads,0)
  const reportResponse=await route.POST(request(body));assert.equal(reportResponse.status,200)
  assert.equal((await reportResponse.json()).report.summary[0].bankAmount,5000)
  tables={orders:[order,{...order,id:'cancelled',status:'cancelled'}],order_additional_payments:[...extras,{...extras[0],id:'cash',method:'cash',amount:500}],income:[
    {id:'manual',branch:'tailoring',order_id:null,date:'2026-10-01',amount:70,network_amount:50,payment_method:'mixed',notes:ref1},
    {id:'legacy',branch:'tailoring',order_id:'o1',date:'2026-10-01',amount:400,payment_method:'network'},
    {id:'cash',branch:'tailoring',order_id:null,date:'2026-10-01',amount:500,payment_method:'cash'},
  ]}
  const tailoringResponse=await route.POST(request({text:prefix+line().replace('1656601901300001','1658362601300001'),start:'2026-10-01',end:'2026-10-04'}))
  assert.equal(tailoringResponse.status,200)
  const tailoringReport=(await tailoringResponse.json()).report
  const tailoringSummary=tailoringReport.summary.find(s=>s.branch==='tailoring')
  assert.equal(tailoringSummary.siteAmount,32500);assert.equal(tailoringSummary.siteCount,4)
  assert.equal(tailoringReport.bankRows[0].status,'reference')
  assert.equal(tailoringReport.summary.find(s=>s.branch==='women').siteAmount,0)
  console.log('PASS tailoring: terminal mapping, branch isolation, deposit/additional/delivery dates, Riyadh midnight, mixed network portion, cancelled/cash exclusion and legacy income deduplication.')
  const records=Array.from({length:1350},(_,i)=>({id:String(i)}))
  const got=await pagination.readAll(async(from)=>({data:records.slice(from,from+250),error:null}))
  assert.equal(got.length,1350)
  await assert.rejects(pagination.readAll(async(from)=>from?{data:null,error:{message:'read failed'}}:{data:[{id:'1'}],error:null}))
  await assert.rejects(pagination.readAll(async()=>({data:[{id:'1'}],error:null})))
  console.log('PASS: dates, halalas, duplicates, repeated amounts, references, net settlements, coverage, unknown terminal, admin authorization, read failure and pagination (1350 rows with a 250-row cap).')

  const pdfIndex=process.argv.indexOf('--pdf')
  if(pdfIndex>=0){
    const pdfPath=process.argv[pdfIndex+1];assert(pdfPath,'Missing PDF path')
    const canvas=require('@napi-rs/canvas');global.DOMMatrix=canvas.DOMMatrix;global.ImageData=canvas.ImageData;global.Path2D=canvas.Path2D
    const worker=pathToFileURL(path.join(root,'public/pdf/hala-pdf.worker-5.4.624.min.mjs')).href
    const moduleFile=path.join(root,'public/pdf/hala-pdf-5.4.624.min.mjs')
    assert.deepEqual(fs.readFileSync(moduleFile),fs.readFileSync(path.join(root,'node_modules/pdfjs-dist/legacy/build/pdf.min.mjs')))
    assert.deepEqual(fs.readFileSync(path.join(root,'public/pdf/hala-pdf.worker-5.4.624.min.mjs')),fs.readFileSync(path.join(root,'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs')))
    const moduleUrl=pathToFileURL(moduleFile).href
    const source=fs.readFileSync(path.join(root,'src/lib/hala-pdf.ts'),'utf8').replace("'/pdf/hala-pdf-5.4.624.min.mjs'",JSON.stringify(moduleUrl)).replace("'/pdf/hala-pdf.worker-5.4.624.min.mjs'",JSON.stringify(worker))
    const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
    const temp=path.join(os.tmpdir(),'yasmin-hala-extractor-'+process.pid+'.mjs');fs.writeFileSync(temp,compiled)
    try{
      const {readHalaPdf}=await import(pathToFileURL(temp).href)
      const text=await readHalaPdf(new File([fs.readFileSync(pdfPath)],'transactions.pdf',{type:'application/pdf'}))
      const bank=lib.parseHalaText(text)
      assert.equal(bank.entries.length,51)
      const report=lib.reconcileHala(bank,[], '2026-10-01','2026-10-04')
      assert.equal(report.bankRows.length,45)
      assert.equal(report.summary.find(s=>s.branch==='women').bankAmount,212500)
      assert.equal(report.summary.find(s=>s.branch==='fabrics').bankAmount,779000)
      assert.equal(report.summary.find(s=>s.branch==='tailoring').bankAmount,1)
      assert(report.bankRows.every(r=>r.branch!==null))
      fs.writeFileSync(path.join(os.tmpdir(),'yasmin-hala-pdf-test-text.txt'),text)
      console.log('PASS actual PDF: 51 sales, withdrawal excluded, 45 October rows; women 2125.00 / fabrics 7790.00 / tailoring 0.01.')
      if(process.argv.includes('--live')) {
        require('@next/env').loadEnvConfig(root,false,{info(){},error(){}})
        assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,'qbbijtyrikhybgszzbjz.supabase.co')
        const liveRoute=load('src/app/api/accounting/hala-reconciliation/route.ts',{
          '@/lib/hala-reconciliation':lib,
          '@/lib/server/hala-read-all':pagination,
          '@/lib/server/hala-tailoring':tailoring,
          '@/lib/server/api-auth':{requireActiveStaff:async()=>({ok:true,staff:{role:'admin'}})},
        })
        // Test authorization separately above. This integration invokes ONLY database SELECTs.
        const response=await liveRoute.POST(request({text,start:'2026-10-01',end:'2026-10-04'}))
        const result=await response.json();assert.equal(response.status,200,JSON.stringify(result))
        assert.equal(result.report.summary.find(s=>s.branch==='women').siteAmount,212500)
        assert.equal(result.report.summary.find(s=>s.branch==='fabrics').siteAmount,779000)
        assert(result.report.settlements.some(s=>s.amount===8000))
        assert.equal(result.report.bankRows.find(r=>r.reference===ref1).status,'reference')
        assert(result.report.bankRows.some(r=>r.status==='missing'||r.status==='review'))
        assert.equal(result.report.summary.find(s=>s.branch==='tailoring').bankAmount,1)
        console.log('PASS live read-only site integration: all three branches read successfully; women/fabrics totals match; SAR80 settlement remains separate and individual mismatches remain visible. No database writes or Alostaz calls.')
      }
    }finally{fs.unlinkSync(temp)}
  }
}
main().catch(e=>{console.error(e);process.exitCode=1})
