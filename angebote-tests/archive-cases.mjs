// Executed inside backend.mjs with its synthetic clients and Google HTTP mock.
export async function archiveCases(t){
 const {fs,path,privateDir,create,meta,unlock,client,expect,admin,alice,bob,json,post,file,source,signed,randomBytes,runWorker,checks}=t;
 const mockPath=path.join(privateDir,'drive-mock.json');
 const setMock=flags=>{const value=JSON.parse(fs.readFileSync(mockPath));Object.assign(value,flags);fs.writeFileSync(mockPath,JSON.stringify(value));return value;};
 const readRecord=id=>JSON.parse(fs.readFileSync(path.join(privateDir,'data/records',id,'record.json')));
 const saveRecord=r=>fs.writeFileSync(path.join(privateDir,'data/records',r.id,'record.json'),JSON.stringify(r));
 const pending=await create(meta('PENDING','ARCHIVE-1'),{'attachments[0]':file(source,'Anlage.pdf')});const p=await unlock(alice,pending);
 const metadata={name:'Testperson Archiv',date:'2026-10-30',request_id:randomBytes(16).toString('hex'),source_sha256:p.sha256,proof:p.proof,documents:Object.fromEntries(p.attachments.map(f=>[f.id,f.sha256]))};
 const complete=(m=metadata,pdf=signed)=>({method:'POST',token:pending.token,body:{pdf:file(pdf),metadata:JSON.stringify(m)}});
 await expect(alice,'archive-progress',409,post({proof:p.proof},pending.token));
 setMock({fail_upload:true});let r=json(await expect(alice,'complete',202,complete()));assert(r.archive_pending&&r.saved_locally&&!r.ok);
 assert.equal(readRecord(pending.id).state,'archive_pending');assert.deepEqual(fs.readFileSync(path.join(privateDir,'data/records',pending.id,'signed.pdf')),signed);checks(3);
 for(const action of ['access','offer','document','attachment&id='+p.attachments[0].id])await expect(alice,action,200,{token:pending.token});
 await expect(alice,'complete',410,complete({...metadata,request_id:randomBytes(16).toString('hex')}));
 await expect(alice,'complete',410,complete(metadata,Buffer.concat([signed,Buffer.from('\n% changed')])));
 await expect(alice,'complete',410,complete({...metadata,name:'Andere Person'}));
 await expect(alice,'complete',400,complete({...metadata,documents:'wrong'}));
 await expect(admin,'create',409,{method:'POST',body:{pdf:file(source),metadata:JSON.stringify(meta('PENDING','ARCHIVE-1'))}});
 await expect(bob,'archive-progress',403,post({proof:p.proof},pending.token));
 await expect(bob,'archive-retry',401,post({id:pending.id}));
 await expect(alice,'archive-progress',403,post({proof:'wrong'},pending.token));
 const before=setMock({fail_upload:false,shared_root:true});r=json(await expect(admin,'archive-retry',202,post({id:pending.id})));assert(!r.ok);checks();
 setMock({shared_root:false,wrong_checksum:true});await expect(admin,'archive-retry',202,post({id:pending.id}));assert.equal(readRecord(pending.id).archive.last_error,'drive_checksum');checks();
 setMock({wrong_checksum:false,wrong_parent:true});await expect(admin,'archive-retry',202,post({id:pending.id}));assert.equal(readRecord(pending.id).state,'archive_pending');checks();
 setMock({wrong_parent:false});let record=readRecord(pending.id);record.expires=0;record.archive.next_attempt=0;saveRecord(record);await expect(alice,'access',200,{token:pending.token});
 const newClient=client();const fresh=await unlock(newClient,pending);assert.equal(fresh.archive_pending,true);checks();
 r=json(await expect(admin,'archive-retry',200,post({id:pending.id})));assert(r.ok&&!r.archive_pending);record=readRecord(pending.id);assert.equal(record.archive.state,'verified');assert.ok(record.completion.completed_at);checks(3);
 for(const action of ['access','offer','document','attachment&id='+p.attachments[0].id])await expect(alice,action,410,{token:pending.token});
 await expect(alice,'archive-progress',200,post({proof:p.proof},pending.token));await expect(alice,'complete',200,complete());
 const count=JSON.parse(fs.readFileSync(mockPath)).uploads;await expect(admin,'archive-retry',200,post({id:pending.id}));assert.equal(JSON.parse(fs.readFileSync(mockPath)).uploads,count);checks();
 const timeout=await create(meta('TIMEOUT','ARCHIVE-2'));const w=await unlock(alice,timeout);const tm={...metadata,request_id:randomBytes(16).toString('hex'),proof:w.proof,source_sha256:w.sha256,documents:Object.fromEntries(w.attachments.map(f=>[f.id,f.sha256]))};
 setMock({timeout_after_upload:true});await expect(alice,'complete',202,{method:'POST',token:timeout.token,body:{pdf:file(signed),metadata:JSON.stringify(tm)}});
 const uploadedAfterTimeout=JSON.parse(fs.readFileSync(mockPath)).uploads;const state=readRecord(timeout.id);assert.equal(state.state,'archive_pending');assert.ok(state.archive.files.signed.id);checks(2);
 await expect(admin,'owner-file&id='+timeout.id+'&kind=signed',200);
 await expect(admin,'archive-retry',200,post({id:timeout.id}));const final=readRecord(timeout.id);assert.equal(final.state,'completed');assert.equal(JSON.parse(fs.readFileSync(mockPath)).uploads-uploadedAfterTimeout,Object.keys(final.archive.files).length-1);checks(2);
 // A multi-batch archive resumes from its persisted cursor without the customer's browser.
 const configPathBatch=path.join(privateDir,'config.php'),configBatch=fs.readFileSync(configPathBatch,'utf8');fs.writeFileSync(configPathBatch,configBatch.replace("'batch_size'=>20","'batch_size'=>1"));
 const batch=await create(meta('BATCH','ARCHIVE-3'));const bm=await unlock(alice,batch);const batchMeta={...metadata,request_id:randomBytes(16).toString('hex'),proof:bm.proof,source_sha256:bm.sha256,documents:Object.fromEntries(bm.attachments.map(f=>[f.id,f.sha256]))};
 await expect(alice,'complete',202,{method:'POST',token:batch.token,body:{pdf:file(signed),metadata:JSON.stringify(batchMeta)}});
 let batchState=readRecord(batch.id);assert.equal(batchState.state,'archive_pending');assert.equal(Object.values(batchState.archive.files).filter(x=>x.verified_at).length,1);checks(2);
 const list=json(await expect(admin,'list',200));assert.equal(list.records.find(x=>x.id===batch.id).archive_state,'pending');checks();
 for(let i=0;i<10&&readRecord(batch.id).state!=='completed';i++){const output=await runWorker();assert.equal(output.errors,'');assert.ok(JSON.parse(output.text).completed>=0);checks();}
 assert.equal(readRecord(batch.id).state,'completed');checks();await expect(alice,'access',410,{token:batch.token});fs.writeFileSync(configPathBatch,configBatch);
 // Missing configuration blocks new customer releases, rather than silently skipping Drive.
 const configPath=path.join(privateDir,'config.php'),config=fs.readFileSync(configPath,'utf8');fs.writeFileSync(configPath,config.replace("'refresh_token'=>'test'","'refresh_token'=>''"));await expect(admin,'create',503,{method:'POST',body:{pdf:file(source),metadata:JSON.stringify(meta('NO-DRIVE','FAIL'))}});fs.writeFileSync(configPath,config);
}
import assert from 'node:assert/strict';
